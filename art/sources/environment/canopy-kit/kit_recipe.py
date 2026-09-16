"""Shared deterministic construction for the Under the Canopy environment kit."""
import bpy,bmesh,math,random,json,sys
from mathutils import Vector
from pathlib import Path

def build(A):
 sys.path.insert(0,str(A.parents[3]/'experiments/building-studio'))
 from stage import create_stage
 if not bpy.app.background:raise RuntimeError('Background build only')
 bpy.ops.wm.read_factory_settings(use_empty=True);C=json.loads((A/'asset.json').read_text());rng=random.Random(C['seed'])
 scene=bpy.context.scene;geo=bpy.data.collections.new('Environment geometry');scene.collection.children.link(geo);studio=bpy.data.collections.new('Studio');scene.collection.children.link(studio)
 def mat(n,h):
  rgb=[int(h[i:i+2],16)/255 for i in (0,2,4)];rgb=[v/12.92 if v<.04045 else ((v+.055)/1.055)**2.4 for v in rgb]
  m=bpy.data.materials.new(n);m.use_nodes=True;m.diffuse_color=(*rgb,1);bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*rgb,1);bs.inputs['Roughness'].default_value=.9;return m
 greens=[mat('Leaf '+str(i),h) for i,h in enumerate(['334b31','49633b','617a46','74864f'])]
 browns=[mat('Wood '+str(i),h) for i,h in enumerate(['494135','65523b','816548','ad895a'])]
 stones=[mat('Stone '+str(i),h) for i,h in enumerate(['505953','657066','7c8174','929384'])]
 caps=[mat('Fungus '+str(i),h) for i,h in enumerate(['754630','a45b3c','c8854f','dbba80'])]
 def mesh(n,v,f,mats,inds=None):
  me=bpy.data.meshes.new(n);me.from_pydata(v,[],f);me.update();ob=bpy.data.objects.new(n,me);geo.objects.link(ob)
  for m in mats:me.materials.append(m)
  for p in me.polygons:p.material_index=(inds[p.index] if inds else p.index%len(mats))
  bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free();return ob
 def rod(n,a,b,r,mats,r2=None,sides=7):
  a,b=Vector(a),Vector(b);axis=(b-a).normalized();u=axis.cross(Vector((0,0,1)))
  if u.length<.01:u=axis.cross(Vector((0,1,0)))
  u.normalize();v=axis.cross(u);points=[]
  for p,rad in [(a,r),(b,r if r2 is None else r2)]:
   points.extend(tuple(p+rad*(math.cos(i*math.tau/sides)*u+math.sin(i*math.tau/sides)*v)) for i in range(sides))
  faces=[tuple(reversed(range(sides))),tuple(sides+i for i in range(sides))]+[(i,(i+1)%sides,(i+1)%sides+sides,i+sides) for i in range(sides)]
  return mesh(n,points,faces,mats)
 def leaf(n,a,b,width,mats):
  a,b=Vector(a),Vector(b);d=b-a;side=Vector((-d.y,d.x,0)).normalized()*width
  p=a+d*.46;ridge=p+Vector((0,0,width*.25));v=[tuple(a),tuple(p+side),tuple(b),tuple(p-side),tuple(ridge)]
  return mesh(n,v,[(0,1,4),(1,2,4),(2,3,4),(3,0,4)],mats,[0,1%len(mats),2%len(mats),1%len(mats)])
 def rock(n,p,scale):
  bm=bmesh.new();bmesh.ops.create_icosphere(bm,subdivisions=2,radius=1)
  for v in bm.verts:
   v.co.x*=scale[0]*rng.uniform(.88,1.1);v.co.y*=scale[1]*rng.uniform(.92,1.1);v.co.z=max(-.6,v.co.z)*scale[2]
  me=bpy.data.meshes.new(n);bm.to_mesh(me);bm.free();ob=bpy.data.objects.new(n,me);geo.objects.link(ob);ob.location=p
  for m in stones+greens:me.materials.append(m)
  for f in me.polygons:f.material_index=(4+rng.randrange(3)) if f.normal.z>.5 and rng.random()<.66 else rng.randrange(4)
  return ob
 kind=C['kit_kind']
 if kind=='fern':
  for cluster in range(3):
   cx,cy=rng.uniform(-.55,.55),rng.uniform(-.55,.55)
   for j in range(9):
    a=j*math.tau/9+rng.uniform(-.1,.1);length=rng.uniform(1.2,1.85);peak=rng.uniform(.85,1.4)
    last=Vector((cx,cy,.02))
    for k in range(1,12):
     t=k/12;p=Vector((cx+math.cos(a)*length*t,cy+math.sin(a)*length*t,math.sin(t*math.pi*.88)*peak))
     rod('Arching fern stem',last,p,.013,greens[:1],.009,5);last=p
     for sign in [-1,1]:
      w=.32*math.sin(t*math.pi)**.6;direction=a+sign*1.08
      end=p+Vector((math.cos(direction)*w,math.sin(direction)*w,-.06))
      leaf('Serrated fern leaflet',p,end,w*.22,greens)
 elif kind=='bramble':
  for j in range(11):
   a=j*math.tau/11;r=rng.uniform(.8,1.7);peak=rng.uniform(1.3,2.25);last=Vector((0,0,.02))
   for k in range(1,6):
    t=k/5;p=Vector((math.cos(a)*r*t,math.sin(a)*r*t,math.sin(t*math.pi*.6)*peak));rod('Bramble cane',last,p,.035,browns[:2],.02);last=p
    for sign in [-1,1]:
     direction=a+sign*1.15;end=p+Vector((math.cos(direction)*.65,math.sin(direction)*.65,.13))
     leaf('Broad folded bramble leaf',p,end,.22,greens)
 elif kind=='mushrooms':
  for j in range(13):
   a=rng.random()*math.tau;r=rng.random()*.85;x,y=math.cos(a)*r,math.sin(a)*r;h=rng.uniform(.35,1.15);radius=h*.42
   rod('Mushroom stalk',(x,y,0),(x+.04,y,h),h*.08,caps[3:],h*.06)
   v=[(x,y,h+.13)];N=12
   for rad,z in [(radius*.55,h+.1),(radius,h-.05),(radius*.9,h-.13)]:
    v.extend((x+math.cos(i*math.tau/N)*rad,y+math.sin(i*math.tau/N)*rad,z) for i in range(N))
   f=[(0,1+i,1+(i+1)%N) for i in range(N)]+[(1+j*N+i,1+j*N+(i+1)%N,1+(j+1)*N+(i+1)%N,1+(j+1)*N+i) for j in range(2) for i in range(N)]
   mesh('Layered ochre mushroom cap',v,f,caps,[1+j%2]*N+[2]*N+[3]*N)
 elif kind=='boulders':
  for i,(x,y,s) in enumerate([(-2.7,0,1.8),(-.3,.5,2.6),(2.6,-.2,2.0),(1,-1.7,1.35),(-1.9,-1.5,1.2)]):rock('Mossy rounded bank rock',(x,y,s*.48),(s,s*.8,s))
 elif kind=='leaf':
  v=[];f=[]
  for k in range(9):
   t=k/8;x=(t-.5)*4;w=math.sin(t*math.pi)**.6*(.9+.15*math.sin(t*20))
   for s in [-1,0,1]:v.append((x,s*w,.08+.5*(t-.4)**2+abs(s)*.15))
  for k in range(8):
   for j in range(2):f.append((k*3+j,k*3+j+1,(k+1)*3+j+1,(k+1)*3+j))
  mesh('Curled fallen leaf',v,f,caps[:3]);rod('Leaf central vein',(-2.3,0,.16),(1.9,0,.27),.028,browns[2:],.015,5)
  for i in range(1,8):
   t=i/8;x=(t-.5)*4;w=math.sin(t*math.pi)**.6*.9
   for sign in [-1,1]:rod('Leaf side vein',(x-.2,0,.12),(x+.22,sign*w,.24),.012,browns[2:],.007,5)
 elif kind=='splinters':
  for i in range(11):
   a=rng.uniform(-.35,.35);x,y=rng.uniform(-.8,.8),rng.uniform(-.8,.8);length=rng.uniform(1.5,4.3);z=.1+i*.06
   rod('Broken twig',(x-math.cos(a)*length*.5,y-math.sin(a)*length*.5,z),(x+math.cos(a)*length*.5,y+math.sin(a)*length*.5,z+.15),rng.uniform(.07,.16),browns,.035,6)
 elif kind=='rootwall':
  for j in range(3):
   v=[];N=12;R=25
   for i in range(R):
    t=i/(R-1);x=-6+t*12;cy=math.sin(x*.43+j*.7)*.55+j*.65-.65;cz=.25+math.sin(t*math.pi)*(1.5-j*.22)
    radius=(.68-j*.13)*(.65+.35*math.sin(t*math.pi))
    for k in range(N):
     a=k*math.tau/N;rough=1+.08*math.sin(k*2.7+i*.6)
     v.append((x,cy+math.cos(a)*radius*rough,cz+math.sin(a)*radius*rough))
   f=[(i*N+k,i*N+(k+1)%N,(i+1)*N+(k+1)%N,(i+1)*N+k) for i in range(R-1) for k in range(N)]
   f.extend([tuple(reversed(range(N))),tuple((R-1)*N+k for k in range(N))])
   ob=mesh('Continuous exposed root',v,f,browns[:1]);uv=ob.data.uv_layers.new(name='Bark along root')
   for face in ob.data.polygons:
    for li in face.loop_indices:
     vi=ob.data.loops[li].vertex_index;uv.data[li].uv=(vi//N*.12,vi%N/N*2)
  for x in [-4,-1,2,4]:rock('Root bank anchor',(x,.2,.5),(1.2,1.2,1.1))
  image=bpy.data.images.load(str(A.parents[3]/'assets/textures/terrain/ancient-bark.png'));image.pack()
  nodes=browns[0].node_tree.nodes;tex=nodes.new('ShaderNodeTexImage');tex.image=image
  browns[0].node_tree.links.new(tex.outputs['Color'],nodes.get('Principled BSDF').inputs['Base Color'])
 elif kind=='acorn':
  N=18;v=[]
  for z,r in [(0,.12),(.2,.62),(.65,.79),(1.2,.7),(1.45,.45)]:v.extend((math.cos(i*math.tau/N)*r,math.sin(i*math.tau/N)*r,z) for i in range(N))
  mesh('Amber brown acorn',v,[(j*N+i,j*N+(i+1)%N,(j+1)*N+(i+1)%N,(j+1)*N+i) for j in range(4) for i in range(N)],browns[1:])
  for j in range(4):
   for i in range(18):
    a=i*math.tau/18+(j%2)*.14;r=.72-j*.12;z=1.12+j*.13
    leaf('Acorn cap scale',(math.cos(a)*r,math.sin(a)*r,z),(math.cos(a)*max(.05,r-.2),math.sin(a)*max(.05,r-.2),z+.22),.13,browns[:2])
  rod('Acorn stalk',(0,0,1.6),(.2,0,2),.12,browns[:2],.08)
 create_stage(C,studio);scene['source_note']='Under the Canopy forest-floor environment kit. Reference-guided stylized geometry; static flat-ground asset.'
 im=bpy.data.images.load(str(A/'reference.png'));im.pack();im.use_fake_user=True
 bpy.context.view_layer.update();bpy.ops.wm.save_as_mainfile(filepath=str(A/C['blend']))
