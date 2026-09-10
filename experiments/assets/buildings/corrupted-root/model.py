"""Corrupted Root: interwoven dead roots enclosing a pale fibrous heart. Shared material reference is the amber seam; architecture and corrupted palette are inferred."""
import bpy,bmesh,math,random,json,sys
from pathlib import Path
from mathutils import Vector
A=Path(__file__).resolve().parent
sys.path.insert(0,str(A.parents[2]/'building-studio'))
from stage import create_stage
if not bpy.app.background:raise RuntimeError('Separate background Blender process required')
bpy.ops.wm.read_factory_settings(use_empty=True)
C=json.loads((A/'asset.json').read_text());P=json.loads((A/'palette.json').read_text())['samples'];rng=random.Random(712)
scene=bpy.context.scene
cols={}
for n in ['Root structure','Pale heart','Fungal shelves','Mining apron','Studio']:
 c=bpy.data.collections.new(n);scene.collection.children.link(c);cols[n]=c
cur=cols['Root structure']
def mat(name,key,factor=1,rough=.8):
 rgb=[min(1,v*factor) for v in P[key]['representative']['linear_rgb']]
 m=bpy.data.materials.new(name);m.diffuse_color=(*rgb,1);m.use_nodes=True
 b=m.node_tree.nodes.get('Principled BSDF');b.inputs['Base Color'].default_value=(*rgb,1);b.inputs['Roughness'].default_value=rough
 return m
BARK=[mat('Ancient bark '+str(i),'bark',f) for i,f in enumerate([.6,.85,1.1,1.35])]
CUT=mat('Split heartwood','cutwood',.9)
STONE=[mat('River stone '+str(i),'stone',f) for i,f in enumerate([.65,.9,1.12])]
MOSS=mat('Root moss','moss',.9)
AMBER=[mat('Amber resin '+str(i),'amber',f,.16) for i,f in enumerate([.65,1,1.35])]
for m in AMBER:
 bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Metallic'].default_value=.08;bs.inputs['Emission Color'].default_value=(*[v*.8 for v in m.diffuse_color[:3]],1);bs.inputs['Emission Strength'].default_value=.06

# Broad albedo variation survives the vertex-color game export; this is not a
# transparency effect. The resin remains opaque for stable real-time ordering.
def surface_variation(material,low,high,scale,stretch=(1,1,1)):
 nodes=material.node_tree.nodes;links=material.node_tree.links
 coord=nodes.new('ShaderNodeTexCoord');mapping=nodes.new('ShaderNodeVectorMath');mapping.operation='MULTIPLY';mapping.inputs[1].default_value=stretch
 noise=nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=scale;noise.inputs['Detail'].default_value=2
 ramp=nodes.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=.2;ramp.color_ramp.elements[0].color=(*low,1);ramp.color_ramp.elements[1].position=.8;ramp.color_ramp.elements[1].color=(*high,1)
 links.new(coord.outputs['Generated'],mapping.inputs[0]);links.new(mapping.outputs[0],noise.inputs['Vector']);links.new(noise.outputs['Fac'],ramp.inputs[0]);links.new(ramp.outputs['Color'],nodes.get('Principled BSDF').inputs['Base Color'])
for material in BARK:
 base=material.diffuse_color[:3];surface_variation(material,[v*.7 for v in base],[min(1,v*1.5) for v in base],3,(3,3,.6))
for material in AMBER:
 surface_variation(material,(.24,.036,.002),(1,.58,.095),2.4,(1,1,1.5))

def mesh(name,v,f,m):
 me=bpy.data.meshes.new(name);me.from_pydata(v,[],f);me.update();bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(me);bm.free()
 ob=bpy.data.objects.new(name,me);cur.objects.link(ob);me.materials.append(m);return ob

def tube(name,points,radii,m,sides=10):
 v=[]
 for i,(p,r) in enumerate(zip(points,radii)):
  p=Vector(p);axis=Vector(points[min(i+1,len(points)-1)])-Vector(points[max(i-1,0)])
  axis.normalize();u=axis.cross(Vector((0,1,0)))
  if u.length<.01:u=axis.cross(Vector((1,0,0)))
  u.normalize();w=axis.cross(u)
  for j in range(sides):v.append(tuple(p+r*(math.cos(j*math.tau/sides)*u+math.sin(j*math.tau/sides)*w)))
 f=[tuple(reversed(range(sides))),tuple((len(points)-1)*sides+j for j in range(sides))]
 for i in range(len(points)-1):
  for j in range(sides):a=i*sides+j;b=i*sides+(j+1)%sides;f.append((a,b,b+sides,a+sides))
 ob=mesh(name,v,f,m)
 if m in BARK:
  # Broken overlapping bark shingles follow the root surface, leaving recessed seams.
  bv=[];bf=[];mi=[]
  for i in range(len(points)-1):
   start,end=Vector(points[i]),Vector(points[i+1]);axis=(end-start).normalized()
   u=axis.cross(Vector((0,1,0)))
   if u.length<.01:u=axis.cross(Vector((1,0,0)))
   u.normalize();w=axis.cross(u)
   courses=max(2,round((end-start).length/.85))
   for k in range(courses):
    for j in range(sides):
     if rng.random()<.05:continue
     offset=rng.uniform(-.1,.1);t0=max(0,k/courses+offset);t1=min(1,(k+.92)/courses+offset)
     angle=j*math.tau/(sides)+rng.uniform(-.015,.015)
     width=math.tau/(sides)*rng.uniform(.65,.96)
     base=len(bv)
     for t,lift in [(t0,.008),((t0+t1)/2,.034),(t1,.015)]:
      for a,bulge in [(angle,0),(angle+width/2,.025),(angle+width,0)]:
       radius=radii[i]*(1-t)+radii[i+1]*t
       bv.append(tuple(start.lerp(end,t)+(radius+lift+bulge)*(math.cos(a)*u+math.sin(a)*w)))
     material=rng.randrange(4)
     for row in range(2):
      for col in range(2):
       q=base+row*3+col;bf.append((q,q+1,q+4,q+3));mi.append(material)
  bark=mesh(name+' overlapping bark',bv,bf,BARK[0])
  for material in BARK[1:]:bark.data.materials.append(material)
  for face,index in zip(bark.data.polygons,mi):face.material_index=index
 return ob

def rock(name,p,s,m,sub=1):
 bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=sub,radius=1,location=p);ob=bpy.context.object;ob.name=name
 for c in list(ob.users_collection):c.objects.unlink(ob)
 cur.objects.link(ob);ob.scale=s;ob.rotation_euler=(rng.uniform(-.3,.3),rng.uniform(-.3,.3),rng.random()*math.tau);ob.data.materials.append(m)
 for v in ob.data.vertices:v.co*=rng.uniform(.88,1.12)
 return ob

def custom(name,h):
 c=[int(h[i:i+2],16)/255 for i in (0,2,4)];c=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in c]
 m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*c,1);b=m.node_tree.nodes.get('Principled BSDF');b.inputs['Base Color'].default_value=(*c,1);b.inputs['Roughness'].default_value=.85;return m
BARK=[custom('Corrupted bark '+str(i),h) for i,h in enumerate(['322934','44323e','544449','635153'])]
HEART=[custom('Exposed root fiber '+str(i),h) for i,h in enumerate(['c1b29c','a9998d','d6cbb3'])]
FUNGUS=[custom('Fungal shelf '+str(i),h) for i,h in enumerate(['73606c','a193a5','cbc2b6'])]
for m in BARK:
 c=m.diffuse_color[:3];surface_variation(m,[v*.7 for v in c],[min(1,v*1.4) for v in c],3,(3,3,.7))
# Thick living-sized structural roots curl inward to a fractured crown, leaving the harvest face open.
for side in [-1,1]:
 tube('Twisted root buttress',[(side*2.8,.45,.15),(side*2,.65,.55),(side*1.3,.85,1.65),(side*1.5,.8,2.8),(side*.9,.85,3.65),(side*.32,.7,3.9)],[.12,.75,.70,.55,.39,.12],BARK[1],10)
 tube('Crown splinter',[(side*.85,.83,3.4),(side*1.1,.96,4.3),(side*.95,1.05,4.8)],[.3,.2,.02],BARK[2],8)
# A broad cross-root wraps the rear and reads coherently when orbiting.
tube('Back connecting root',[(-2,1,.4),(-1.6,1.4,1.5),(-.4,1.4,2.9),(.8,1.35,2.3),(2.1,1.1,.3)],[.55,.65,.6,.7,.5],BARK[0],10)
for j in range(9):
 a=j*math.tau/9
 if math.sin(a)<-.7:continue
 x,y=math.cos(a),math.sin(a)
 tube('Ground-reaching root',[(x*.6,y*.5,.23),(x*2.3,y*1.8,.35),(x*3.3,y*2.5,.12),(x*3.7,y*2.8,.035)],[.42,.33,.19,.035],BARK[j%4],8)
cur=cols['Pale heart']
# The resource is cuttable fibrous root, visibly unlike crystalline amber.
for j in range(8):
 a=j*2.39;x=math.cos(a)*.65;y=.4+math.sin(a)*.32;h=2.6+rng.random()*.65
 tube('Pale exposed twisted root',[(x,y,.05),(x+.25*math.sin(a),y-.15,.7),(x-.3*math.cos(a),y+.15,1.45),(x+.18,y,2.1),(x-.15,y+.08,h)],[.25,.29,.27,.21,.10],HEART[j%3],8)
for j in range(3):
 x=-.55+j*.52
 tube('Fractured core sliver',[(x,.45,2),(x-.18,.5,2.6),(x-.10,.52,2.9+rng.random()*.3)],[.16,.11,.025],HEART[(j+1)%3],7)
cur=cols['Fungal shelves']
for side in [-1,1]:
 for j in range(4):
  x=side*(1.7-j*.1);y=.05;z=.65+j*.48
  rock('Bracket fungus',(x,y,z),(.45,.5,.12),FUNGUS[j%3],2)
cur=cols['Mining apron']
for j in range(22):
 a=j*2.39;r=2.7+rng.random()*.45;s=.15+rng.random()*.22
 rock('Weathered ground stone',(math.cos(a)*r,math.sin(a)*r*.8,s*.35),(s,s*.75,s*.6),STONE[j%3],1)
for j in range(6):
 x=-.9+j*.34;y=-.6-rng.random()*.5
 tube('Loose cut root',[(x,y,.13),(x+.13,y+.3,.16),(x+.3,y+.43,.18)],[.12,.13,.06],HEART[j%3],7)
create_stage(C,cols['Studio'])
scene['source_note']='Neutral Corrupted Root deposit. Amber-seam reference supplies natural root scale and texture language; new silhouette, pale core and hidden surfaces inferred. No ownership surfaces.'
im=bpy.data.images.load(str(A/'reference.png'));im.pack();im.use_fake_user=True
bpy.context.view_layer.update();(A/'model-stats.json').write_text(json.dumps({'objects':len(scene.objects),'meshes':sum(o.type=='MESH' for o in scene.objects),'source_faces':sum(len(o.data.polygons) for o in scene.objects if o.type=='MESH'),'materials':len(bpy.data.materials),'blender':bpy.app.version_string},indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(A/C['blend']))
