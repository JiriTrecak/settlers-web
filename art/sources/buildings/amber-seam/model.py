"""Neutral amber seam: split ancient root with exposed resin, accessible mining face."""
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
for n in ['Root structure','Amber seam','Bark plates','Mining apron','Studio']:
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
   courses=max(2,round((end-start).length/.58))
   for k in range(courses):
    for j in range(sides*3):
     if rng.random()<.05:continue
     offset=rng.uniform(-.1,.1);t0=max(0,k/courses+offset);t1=min(1,(k+.92)/courses+offset)
     angle=j*math.tau/(sides*3)+rng.uniform(-.015,.015)
     width=math.tau/(sides*3)*rng.uniform(.65,.96)
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
# Tall split trunks enclose amber without covering the working face (-Y).
for side in [-1,1]:
 tube('Split trunk '+str(side),[(side*2.5,.5,.22),(side*1.95,.75,1.1),(side*1.55,1,2.5),(side*1.25,1.05,4.0),(side*1.18,1,5.1 if side<0 else 4.5)],[.95,.9,.75,.53,.32],BARK[1],12)
 for i in range(4):
  x=side*(1.0+i*.19)
  tube('Broken splinter',[(x,.9,3.4),(x+.13,.94,4.5),(x+.04,.91,5.25+rng.uniform(-.45,.35))],[.24,.19,.018],CUT,7)
# The reference's low front root arch leaves a real opening into the resin cavity.
tube('Front root arch',[(-2.6,-1.0,.2),(-2.1,-1.1,.65),(-1.8,-.9,1.5),(-1.25,-.55,2.3),(-.65,-.3,2.45),(0,-.1,1.65),(.35,-.1,.2)],[.6,.6,.5,.43,.43,.48,.65],BARK[1],12)
for i in range(11):
 a=i*math.tau/11
 # Leave the forward apron clear of high roots.
 if math.sin(a)<-.7:continue
 x,y=math.cos(a),math.sin(a)
 tube('Radiating root '+str(i),[(x*1.7,y*1.4,.75),(x*2.5,y*2,.38),(x*3.3,y*2.55,.15),(x*3.7,y*2.9,.06)],[.48,.4,.22,.035],BARK[i%4],9)
# Large faceted resin masses form the central seam.
cur=cols['Amber seam']
for x,y,z,s in [(.45,.48,.65,.75),(.6,.5,1.65,.83),(.38,.62,2.7,.82),(-.1,.77,3.45,.65),(-1.2,.28,.85,.52),(-1,.38,1.5,.4)]:
 rock('Exposed amber nodule',(x,y,z),(s,s*.7,s*1.02),AMBER[rng.randrange(3)],2)
for i in range(20):
 x=rng.uniform(-1.7,1.7);y=rng.uniform(-1.5,.6);s=rng.uniform(.07,.2)
 rock('Amber fragment',(x,y,s*.55),(s,s*.75,s*.8),AMBER[i%3],1)
# Broad detached bark facets provide readable irregularity, not thin grain noodles.
cur=cols['Bark plates']
for side in [-1,1]:
 for i in range(36):
  z=rng.uniform(.6,4.0);x=side*(2.15-z*.2);y=rng.uniform(.25,1.35)
  rock('Layered bark facet',(x+side*rng.uniform(.1,.3),y,z),(.17,.23,rng.uniform(.24,.42)),BARK[i%4],1)
# A rock-studded apron at ground zero, no collider-sized solid base plate.
cur=cols['Mining apron']
for i in range(30):
 a=rng.random()*math.tau;r=rng.uniform(2.4,3.3);s=rng.uniform(.18,.47)
 x,y=math.cos(a)*r,math.sin(a)*r*.8
 rock('Apron stone',(x,y,s*.42),(s,s*.8,s*.7),STONE[i%3],1)
 if i%3==0:rock('Moss on stone',(x,y,s*.83),(s*.75,s*.65,s*.13),MOSS,1)
create_stage(C,cols['Studio'])
scene['source_note']='Neutral resource node; split-root rear inferred from the single reference. No ownership surfaces.'
im=bpy.data.images.load(str(A/'reference.png'));im.pack();im.use_fake_user=True
bpy.context.view_layer.update();(A/'model-stats.json').write_text(json.dumps({'objects':len(scene.objects),'meshes':sum(o.type=='MESH' for o in scene.objects),'faces':sum(len(o.data.polygons) for o in scene.objects if o.type=='MESH'),'materials':len(bpy.data.materials),'blender':bpy.app.version_string},indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(A/C['blend']))
