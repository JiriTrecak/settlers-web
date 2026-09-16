"""Permanent ancient forest trunk: broad bark flutes, buttress roots, moss and shelf fungi."""
import bpy,bmesh,math,random,json,sys
from pathlib import Path
from mathutils import Vector
A=Path(__file__).resolve().parent
ROOT=A.parents[3]
sys.path.insert(0,str(ROOT/'experiments/building-studio'))
from stage import create_stage,aim
if not bpy.app.background: raise RuntimeError('Build in background Blender')
bpy.ops.wm.read_factory_settings(use_empty=True)
C=json.loads((A/'asset.json').read_text());random.seed(C['seed'])
scene=bpy.context.scene
geo=bpy.data.collections.new('Ancient trunk · permanent solid obstacle');scene.collection.children.link(geo)
studio=bpy.data.collections.new('Studio');scene.collection.children.link(studio)
def linear(v):
 v=v/255;return v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4
# Matched to the approved scene's broad warm bark and cool olive moss, adjusted for albedo.
def material(name,h):
 color=tuple(linear(int(h[i:i+2],16)) for i in (0,2,4));m=bpy.data.materials.new(name);m.use_nodes=True
 bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*color,1);bs.inputs['Roughness'].default_value=.96;m.diffuse_color=(*color,1);return m
bark=[material('Bark '+str(i),h) for i,h in enumerate(['51483b','625442','706049','7c694f','8a7557'])]
moss=[material('Moss '+str(i),h) for i,h in enumerate(['36462e','455837','566641'])]
fungi=[material('Shelf fungus '+str(i),h) for i,h in enumerate(['8b7253','beaa7c','d4c499'])]
def mesh(name,v,f,mats,indices=None):
 me=bpy.data.meshes.new(name);me.from_pydata(v,[],f);me.update();ob=bpy.data.objects.new(name,me);geo.objects.link(ob)
 for m in mats:me.materials.append(m)
 if indices:
  for p,i in zip(me.polygons,indices):p.material_index=i
 bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free();return ob
# Massive tapering fluted bole. Low broad facets carry color instead of noisy texture detail.
N=40;levels=[0,.45,1.2,2.5,4.3,8,15,24,35,48,60]
v=[]
for j,z in enumerate(levels):
 for i in range(N):
  a=math.tau*i/N+.012*z
  flute=.18*math.cos(a*10+.05*z)+.06*math.sin(a*17)
  r=2.8+2.0*math.exp(-z/1.35)-.025*z+flute*1.6
  v.append((r*math.cos(a)+.48*math.sin(z*.23),r*math.sin(a)+.4*math.sin(z*.19),z))
f=[];mi=[]
for j in range(len(levels)-1):
 for i in range(N):
  f.append((j*N+i,j*N+(i+1)%N,(j+1)*N+(i+1)%N,(j+1)*N+i))
  mi.append([1,3,2,0][i%4] if random.random()<.85 else 2)
f.extend([tuple(reversed(range(N))),tuple((len(levels)-1)*N+i for i in range(N))]);mi.extend([0,2])
trunk=mesh('Ancient fluted trunk',v,f,bark,mi)
# Smooth the long bole so large triangles do not form alternating light bands.
for face in trunk.data.polygons:
 if face.index < N*(len(levels)-1):face.use_smooth=True
# Wedge roots spread into a contiguous low mound; their tip elevations meet opaque terrain.
for i in range(11):
 a=i*math.tau/11+random.uniform(-.08,.08);length=random.uniform(6.0,7.0);width=random.uniform(.6,.95)
 vv=[]
 for r,w,h in [(2.3,width*.85,random.uniform(3.3,4.8)),(3.8,width*1.3,1.8),(5.1,width*.88,.7),(length,.16,.04)]:
  for side,z in [(-1,0),(-.6,h*.62),(0,h),(.6,h*.62),(1,0)]:
   vv.append((r*math.cos(a)-side*w*math.sin(a),r*math.sin(a)+side*w*math.cos(a),z))
 ff=[]
 for j in range(3):
  for k in range(4):ff.append((j*5+k,j*5+k+1,(j+1)*5+k+1,(j+1)*5+k))
 ff.extend([(0,1,2,3,4),(15,19,18,17,16),(0,15,19,4)])
 mesh('Buttress root %02d'%i,vv,ff,bark,[2,3,3,2]*3+[0,1,0])
 # Moss follows the upper root, leaving warm bark on the vertical sides.
 mv=[]
 for r,w,h in [(3.4,width*.52,1.98),(4.1,width*.45,1.58),(5.0,width*.35,.83),(length-.2,.08,.11)]:
  for s in [-1,0,1]:mv.append((r*math.cos(a)-s*w*math.sin(a),r*math.sin(a)+s*w*math.cos(a),h-abs(s)*.17))
 mesh('Moss on root %02d'%i,mv,[(j*3+k,j*3+k+1,(j+1)*3+k+1,(j+1)*3+k) for j in range(3) for k in range(2)],moss,[random.randrange(3) for _ in range(6)])
# Small clustered bracket fungi reinforce scale close to the ground.
for i in range(9):
 a=-1.5+random.uniform(-.5,.6);z=.9+i*.28;r=3.1;rad=random.uniform(.22,.48)
 vv=[(r*math.cos(a),r*math.sin(a),z)]
 for k in range(9):
  t=-math.pi/2+k*math.pi/8;rr=r+math.cos(t)*rad
  vv.append((rr*math.cos(a)-math.sin(t)*rad*math.sin(a),rr*math.sin(a)+math.sin(t)*rad*math.cos(a),z+.08*(1-math.cos(t))))
 mesh('Bracket fungus',vv,[(0,k,k+1) for k in range(1,9)],fungi,[1 if k<6 else 2 for k in range(8)])
# Shared packed albedo retains bark detail at gameplay scale.
bark_image=bpy.data.images.load(str(ROOT/'assets/textures/terrain/ancient-bark.png'));bark_image.pack()
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
   coords.append(((math.atan2(v.y,v.x)/math.tau%1)*4,v.z*.18))
  if max(u for u,v in coords)-min(u for u,v in coords)>2:coords=[(u+4 if u<2 else u,v) for u,v in coords]
  for li,co in zip(polygon.loop_indices,coords):uv.data[li].uv=co

create_stage(C,studio)
for ob in studio.objects:
 if ob.type=='LIGHT':ob.location*=3;ob.data.size*=3;aim(ob,(0,0,7))
scene.camera.location=(scene.camera.location-Vector(C['camera']['target']))*2+Vector(C['camera']['target'])
scene['source_note']='Approved Under the Canopy settlement concept. Permanent trunk base; crown intentionally above gameplay view. Flat-ground root contact.'
im=bpy.data.images.load(str(A/'reference.png'));im.pack();im.use_fake_user=True
bpy.context.view_layer.update()
(A/'model-stats.json').write_text(json.dumps({'meshes':len(geo.objects),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in geo.objects),'materials':len(bpy.data.materials)},indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(A/C['blend']))
