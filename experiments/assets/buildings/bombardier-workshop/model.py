"""Bombardier Workshop: twin armored sheds framing an open mortar assembly bay.
The stonemason reference supplies the shared material/style language, not this new architecture.
"""
import bpy, bmesh, math, random, json, sys
from pathlib import Path
from mathutils import Vector
A=Path(__file__).resolve().parent
sys.path.insert(0,str(A.parents[2]/'building-studio'))
from stage import create_stage
if not bpy.app.background: raise RuntimeError('Background build only; do not reset an open document')
bpy.ops.wm.read_factory_settings(use_empty=True)
C=json.loads((A/'asset.json').read_text()); P=json.loads((A/'palette.json').read_text())['samples']
rng=random.Random(491); scene=bpy.context.scene
cols={}
for n in ['Foundation and apron','Timber shelter','Curved roof','Mortar assembly','Shell stores','Ownership','Studio']:
 c=bpy.data.collections.new(n); scene.collection.children.link(c); cols[n]=c
cur=cols['Foundation and apron']
def linear(h):
 return [(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4) for v in [int(h[i:i+2],16)/255 for i in (0,2,4)]]
def mat(n, color, metallic=0):
 m=bpy.data.materials.new(n); m.use_nodes=True; m.diffuse_color=(*color,1)
 bs=m.node_tree.nodes.get('Principled BSDF'); bs.inputs['Base Color'].default_value=(*color,1); bs.inputs['Roughness'].default_value=.72; bs.inputs['Metallic'].default_value=metallic
 return m
def sample(n,key,f=1,metallic=0):return mat(n,[min(1,v*f) for v in P[key]['representative']['linear_rgb']],metallic)
WOOD=[sample('Oak '+str(i),'oak',f) for i,f in enumerate([1.0,1.4,1.8])]
ROOF=[sample('Bark-red roof '+str(i),'roof_red',f) for i,f in enumerate([.22,.32,.42])]
STONE=[mat('Foundation stone '+str(i),linear(h)) for i,h in enumerate(['626764','7d8075','959788'])]
IRON=sample('Weathered iron','iron',.7,.65); EDGE=mat('Polished steel edge',linear('9baba9'),.7)
END=sample('Pale cut timber','endgrain',.65); BRASS=mat('Brass fasteners',linear('ad8447'),.5)
ROOT=mat('Corrupted root bark',linear('44313e')); CORE=mat('Pale root heart',linear('a293bb'))
TEAM=mat('TC_TeamColor',linear('A04B31')); DARK=mat('Recesses',linear('171b19'))
for material in WOOD+ROOF:
 ns=material.node_tree.nodes; ls=material.node_tree.links; base=material.diffuse_color[:3]
 coord=ns.new('ShaderNodeTexCoord'); scale=ns.new('ShaderNodeVectorMath');scale.operation='MULTIPLY';scale.inputs[1].default_value=(3,3,.6)
 noise=ns.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=2;noise.inputs['Detail'].default_value=1
 ramp=ns.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].color=tuple(v*.65 for v in base)+(1,);ramp.color_ramp.elements[1].color=tuple(min(1,v*1.4) for v in base)+(1,)
 ls.new(coord.outputs['Generated'],scale.inputs[0]);ls.new(scale.outputs[0],noise.inputs['Vector']);ls.new(noise.outputs['Fac'],ramp.inputs[0]);ls.new(ramp.outputs['Color'],ns.get('Principled BSDF').inputs['Base Color'])
def mesh(n,v,f,m):
 me=bpy.data.meshes.new(n); me.from_pydata(v,[],f); me.update()
 bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free()
 ob=bpy.data.objects.new(n,me);cur.objects.link(ob);me.materials.append(m);return ob
def box(n,p,s,m,bevel=.025):
 v=[(a*s[0]/2,b*s[1]/2,c*s[2]/2) for a,b,c in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
 o=mesh(n,v,[(0,3,2,1),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6,7)],m);o.location=p
 if bevel:mod=o.modifiers.new('Hewn edge','BEVEL');mod.width=bevel;mod.segments=1
 return o
def beam(n,a,b,w,m):
 a,b=Vector(a),Vector(b);o=box(n,(a+b)/2,(w,w,(b-a).length),m);o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();return o
def rod(n,a,b,r,m,sides=12,r2=None):
 a,b=Vector(a),Vector(b);axis=(b-a).normalized();u=axis.cross(Vector((0,1,0)))
 if u.length<.01:u=axis.cross(Vector((1,0,0)))
 u.normalize();w=axis.cross(u);v=[]
 for p,rr in [(a,r),(b,r if r2 is None else r2)]:
  for j in range(sides):v.append(tuple(p+rr*(math.cos(j*math.tau/sides)*u+math.sin(j*math.tau/sides)*w)))
 f=[tuple(reversed(range(sides))),tuple(sides+j for j in range(sides))]+[(j,(j+1)%sides,(j+1)%sides+sides,j+sides) for j in range(sides)]
 return mesh(n,v,f,m)
def ring(n,center,r,width,depth,m,sides=20):
 x,y,z=center;v=[]
 for zz,rr in [(z-depth/2,r),(z-depth/2,r-width),(z+depth/2,r),(z+depth/2,r-width)]:
  v.extend([(x+rr*math.cos(j*math.tau/sides),y+rr*math.sin(j*math.tau/sides),zz) for j in range(sides)])
 f=[]
 for a,b in [(0,1),(0,2),(2,3),(1,3)]:
  for j in range(sides):k=(j+1)%sides;f.append((a*sides+j,a*sides+k,b*sides+k,b*sides+j))
 return mesh(n,v,f,m)
# Broad stone plinth and the open working apron. Central lane faces -Y.
for row in range(5):
 for col in range(8):box('Apron stone',(-3.08+col*.88,-2.25+row*.96,.16),(.86,.94,.32),STONE[(row+col)%3],.045)
for row in range(12):box('Assembly floor board',(0,-2.14+row*.38,.37),(6.0,.36,.12),WOOD[row%3],.015)
# Two distinctly low, long side sheds keep the central mortar and hoist visible.
cur=cols['Timber shelter']
for side in [-1,1]:
 center=side*2.32
 for x in [center-.68,center+.68]:
  for y in [-1.75,1.75]:
   box('Braced shed post',(x,y,1.62),(.34,.34,2.44),WOOD[1],.045)
   box('Stone shoe',(x,y,.61),(.52,.52,.46),STONE[1],.045)
   box('Post iron collar',(x,y,2.45),(.41,.41,.17),IRON)
   box('Pale endcap',(x,y,2.85),(.32,.32,.065),END)
   beam('Knee brace',(x,y,2),(x,y+(.55 if y<0 else -.55),2.6),.18,WOOD[2])
 for x in [center-.68,center+.68]:beam('Eave timber',(x,-2.1,2.65),(x,2.1,2.65),.26,WOOD[1])
 for y in [-1.85,1.85]:beam('Shed gable',(center-.88,y,2.61),(center+.88,y,2.61),.24,WOOD[1])
 for j in range(10):box('Outer shed siding',(center+side*.70,-1.58+j*.35,1.46),(.16,.33,1.90),WOOD[j%3],.018)
 for j in range(5):box('Shed rear siding',(center-.58+j*.29,1.81,1.46),(.27,.16,1.90),WOOD[j%3],.018)
 cur=cols['Curved roof']
 for slope in [-1,1]:
  for row in range(3):
   for j in range(8):
    v=[]
    for k in range(3):
     t=row/3+(1/3+.055)*k/2
     for y in [-2.15+j*.54,-2.15+j*.54+.52]:v.append((center+slope*.99*t,y,3.45-.73*t**1.5+.035*(2-row)))
    v += [(x,y,z-.09) for x,y,z in v]
    mesh('Overlapping red shingle',v,[(0,1,3,2),(2,3,5,4),(6,8,9,7),(8,10,11,9),(0,6,7,1),(4,5,11,10),(0,2,8,6),(2,4,10,8),(1,7,9,3),(3,9,11,5)],ROOF[(row+j)%3])
  for y in [-2.15,0,2.15]:
   for k in range(6):
    t=k/6;t2=(k+1)/6
    beam('Forged roof strap',(center+slope*t,y,3.57-.73*t**1.5),(center+slope*t2,y,3.57-.73*t2**1.5),.11,IRON)
    if k%2==0:rod('Roof strap rivet',(center+slope*t,y,3.58-.73*t**1.5),(center+slope*t,y,3.64-.73*t**1.5),.047,BRASS,8)
 beam('Capped roof ridge',(center,-2.30,3.55),(center,2.3,3.55),.20,WOOD[1])
 cur=cols['Timber shelter']
# Heavy rear gantry: no delicate dangling chains. A broad pulley and cable cradle the mortar.
cur=cols['Mortar assembly']
for x in [-1.28,1.28]:
 box('Gantry upright',(x,.92,2.52),(.42,.44,4.15),WOOD[1],.06)
 box('Gantry footing',(x,.92,.64),(.68,.68,.48),STONE[0],.045)
 for z in [1.05,3.75]:box('Gantry armor cuff',(x,.92,z),(.49,.51,.27),IRON,.03)
 beam('Gantry diagonal',(x,.92,3.25),(x+(.62 if x<0 else -.62),.92,4.24),.24,WOOD[2])
box('Hoist crossbeam',(0,.92,4.39),(3.26,.53,.44),WOOD[1],.055)
for x in [-1.3,1.3]:box('Crossbeam end armor',(x,.92,4.39),(.28,.60,.50),IRON,.03)
rod('Pulley axle',(0,.50,4.06),(0,1.12,4.06),.10,EDGE,12)
rod('Pulley drum',(0,.6,4.06),(0,.95,4.06),.25,BRASS,16)
for y in [.58,.95]:rod('Pulley cheek',(0,y,4.06),(0,y+.06,4.06),.32,IRON,16)
for x in [-.19,.19]:rod('Hoist cable',(x,.65,4.05),(x,.65,2.59),.035,IRON,8)
# Large unmistakable hollow mortar on a low swiveling cradle, angled out of the bay.
box('Mortar carriage',(0,-.12,.64),(1.8,1.74,.32),WOOD[1],.05)
for x in [-.83,.83]:
 beam('Cradle cheek',(x,-.78,.82),(x,.4,1.70),.23,IRON)
 rod('Trunnion cap',(x-.08,.0,1.4),(x+.08,.0,1.4),.20,BRASS,12)
base=Vector((0,.30,1.16));tip=Vector((0,-.61,2.58));axis=(tip-base).normalized();u=Vector((1,0,0));v=axis.cross(u);N=20
verts=[]
for p,r in [(base,.38),(tip,.46),(tip,.33),(tip-axis*.74,.30)]:
 for j in range(N):verts.append(tuple(p+r*(math.cos(j*math.tau/N)*u+math.sin(j*math.tau/N)*v)))
faces=[]
for a,b in [(0,1),(1,2),(2,3)]:
 for j in range(N):k=(j+1)%N;faces.append((a*N+j,a*N+k,b*N+k,b*N+j))
faces.append(tuple(reversed(range(N))));mesh('Hollow mortar barrel',verts,faces,IRON)
rod('Dark bore interior',tip-axis*.75,tip-axis*.74,.295,DARK,N)
for t in [.13,.70,1.0]:
 p=base+(tip-base)*t
 # Annular metal band follows the bore axis and never caps the muzzle.
 vv=[]
 for q,r in [(p-axis*.06,.40+.06*t),(p+axis*.06,.40+.06*t),(p-axis*.06,.36+.06*t),(p+axis*.06,.36+.06*t)]:
  for j in range(N):vv.append(tuple(q+r*(math.cos(j*math.tau/N)*u+math.sin(j*math.tau/N)*v)))
 ff=[]
 for a,b in [(0,1),(0,2),(1,3)]:
  for j in range(N):k=(j+1)%N;ff.append((a*N+j,a*N+k,b*N+k,b*N+j))
 mesh('Mortar forged band',vv,ff,EDGE if t==1 else BRASS)
# Accessible shell racks on the front aprons; bronze tips and dark iron casings.
cur=cols['Shell stores']
def shell(x,y,z):
 rod('Root shell casing',(x,y,z),(x,y,z+.40),.14,IRON,10)
 rod('Root shell shoulder',(x,y,z+.40),(x,y,z+.63),.14,BRASS,10,r2=.035)
 ring('Shell brass base',(x,y,z+.04),.16,.035,.075,BRASS,10)
for side in [-1,1]:
 x=side*2.3
 for z in [.57,1.32]:
  box('Shell rack shelf',(x,-2.14,z),(1.25,.69,.15),WOOD[2],.035)
  for j in range(4):shell(x-.43+j*.29,-2.14,z+.09)
 for xx in [x-.63,x+.63]:box('Shell rack upright',(xx,-1.9,1.15),(.12,.12,1.5),IRON,.015)
# Rear assembly table, rolled harnesses and broad steel sheets give a coherent back view.
for x in [-.7,.7]:box('Bench leg',(x,1.64,.88),(.16,.25,.85),WOOD[1])
box('Assembly workbench',(0,1.64,1.35),(1.8,.64,.16),WOOD[2])
for j in range(3):box('Backplate blank',(-.46+j*.45,1.6,1.49),(.38,.45,.12),IRON,.045)
# Entrance flag and two small warm lanterns.
cur=cols['Ownership']
beam('Ownership mast',(-1.28,.9,4.2),(-1.28,.9,5.65),.08,WOOD[1])
verts=[];faces=[]
for j in range(4):
 for i in range(7):
  t=i/6;h=j/3;verts.append((-1.28+.93*t,.89+.08*math.sin(t*5+h),5.60-.63*h-.07*t))
for j in range(3):
 for i in range(6):k=j*7+i;faces.append((k,k+1,k+8,k+7))
mesh('Plain team pennant',verts,faces,TEAM)
GLOW=mat('Amber lantern glass',linear('eaa541'))
bs=GLOW.node_tree.nodes.get('Principled BSDF');bs.inputs['Emission Color'].default_value=(*linear('f3a631'),1);bs.inputs['Emission Strength'].default_value=.8
for x in [-1.61,1.61]:
 box('Lantern glass',(x,-1.82,1.84),(.18,.18,.27),GLOW,.012)
 for z in [1.67,2.01]:box('Lantern cap',(x,-1.82,z),(.27,.27,.075),IRON,.02)
 for dx in [-.11,.11]:beam('Lantern edge',(x+dx,-1.94,1.68),(x+dx,-1.94,2.0),.026,IRON)
# Broader hardware at the gantry front reads as manufactured armor at game distance.
cur=cols['Mortar assembly']
for x in [-1.28,1.28]:
 box('Gantry front armor',(x,.65,2.6),(.35,.08,1.55),IRON,.025)
 for z in [1.96,2.58,3.23]:rod('Gantry brass bolt',(x,.59,z),(x,.55,z),.07,BRASS,8)
beam('Hoist cradle lower rail',(-.23,.65,2.59),(.23,.65,2.59),.07,IRON)
beam('Cradle suspension',(-.23,.65,2.59),(-.42,.25,1.75),.05,IRON)
beam('Cradle suspension',(.23,.65,2.59),(.42,.25,1.75),.05,IRON)
# Irregular shingle edges and broad end-grain strips, without dense surface geometry.
for ob in cols['Curved roof'].objects:
 if ob.name.startswith('Overlapping red shingle'):
  dz=rng.uniform(-.022,.022)
  for ve in ob.data.vertices: ve.co.z+=dz
for x in [-1.28,1.28]:box('Gantry end grain',(x,.92,4.62),(.36,.38,.05),END,.025)
create_stage(C,cols['Studio'])
scene['source_note']='Original Bombardier Workshop architecture. User ant workshop image is material/style reference; twin sheds, open mortar bay and all hidden surfaces authored/inferred.'
im=bpy.data.images.load(str(A/'reference.png'));im.pack();im.use_fake_user=True
bpy.context.view_layer.update()
(A/'model-stats.json').write_text(json.dumps({'objects':len(scene.objects),'meshes':sum(o.type=='MESH' for o in scene.objects),'source_faces':sum(len(o.data.polygons) for o in scene.objects if o.type=='MESH'),'materials':len(bpy.data.materials),'blender':bpy.app.version_string},indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(A/C['blend']))
