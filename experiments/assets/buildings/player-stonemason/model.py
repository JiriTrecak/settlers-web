"""Stonemason workshop: reference reconstruction with inferred rear."""
import bpy,bmesh,math,random,json,sys
from pathlib import Path
from mathutils import Vector
A=Path(__file__).resolve().parent;sys.path.insert(0,str(A.parents[2]/'building-studio'))
from stage import create_stage
if not bpy.app.background:raise RuntimeError('Background build only')
bpy.ops.wm.read_factory_settings(use_empty=True)
C=json.loads((A/'asset.json').read_text());P=json.loads((A/'palette.json').read_text())['samples'];random.seed(28);scene=bpy.context.scene
cols={}
for n in ['01 Stone foundations','02 Timber workshop','03 Rock stockpile','04 Red shingle roof','05 Bench tools and lanterns','06 Player flag','07 Studio']:
 c=bpy.data.collections.new(n);scene.collection.children.link(c);cols[n]=c
cur=cols['01 Stone foundations']
def rgb(h):return [((int(h[i:i+2],16)/255+.055)/1.055)**2.4 for i in (0,2,4)]
def mat(n,color,grain=False):
 m=bpy.data.materials.new(n);m.use_nodes=True;m.diffuse_color=(*color,1);bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*color,1);bs.inputs['Roughness'].default_value=.85
 if grain:
  ns=m.node_tree.nodes;ls=m.node_tree.links;co=ns.new('ShaderNodeTexCoord');mp=ns.new('ShaderNodeVectorMath');mp.operation='MULTIPLY';mp.inputs[1].default_value=(7,7,1.2);ls.new(co.outputs['Generated'],mp.inputs[0]);no=ns.new('ShaderNodeTexNoise');no.inputs['Scale'].default_value=2.5;no.inputs['Detail'].default_value=1.2;ls.new(mp.outputs[0],no.inputs['Vector']);ra=ns.new('ShaderNodeValToRGB');ra.color_ramp.elements[0].color=tuple(v*.65 for v in color)+(1,);ra.color_ramp.elements[1].color=tuple(min(1,v*1.2) for v in color)+(1,);ls.new(no.outputs['Fac'],ra.inputs[0]);ls.new(ra.outputs['Color'],bs.inputs['Base Color'])
 return m
WOOD=[mat('Oak '+str(i),[v*f for v in P['oak']['representative']['linear_rgb']],True) for i,f in enumerate([1.0,1.35,1.65,1.9])]
RED=[mat('Terracotta shingles '+str(i),[v*f for v in P['roof_red']['representative']['linear_rgb']],True) for i,f in enumerate([.28,.36,.46,.55])]
STONE=[mat('Warm grey stone '+str(i),rgb(h)) for i,h in enumerate(['777b78','8a8e8a','a5a79e'])]
IRON=mat('Forged iron',rgb('595650'));STEEL=mat('Steel blade',rgb('b2b8b6'));GOLD=mat('Brass rivets',rgb('b6904c'));END=mat('Cut oak ends',rgb('cfaa70'));TEAM=mat('TC_TeamColor',rgb('b72e21'));DARK=mat('Recess shadow',rgb('241d15'));GLOW=mat('Amber lantern glass',rgb('ffb52b'));bs=GLOW.node_tree.nodes.get('Principled BSDF');bs.inputs['Emission Color'].default_value=(1,.35,.025,1);bs.inputs['Emission Strength'].default_value=2

def mesh(n,v,f,m):
 me=bpy.data.meshes.new(n);me.from_pydata(v,[],f);me.update();ob=bpy.data.objects.new(n,me);cur.objects.link(ob);me.materials.append(m);return ob

def cube(n,p,s,m,bevel=0):
 x,y,z=s;v=[(i*x/2,j*y/2,k*z/2) for i,j,k in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
 ob=mesh(n,v,[(0,3,2,1),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6,7)],m);ob.location=p
 if bevel:mo=ob.modifiers.new('Soft hewn corners','BEVEL');mo.width=bevel;mo.segments=1
 return ob

def rod(n,a,b,r,m,r2=None,sides=8):
 a,b=Vector(a),Vector(b);axis=b-a;u=axis.normalized().cross(Vector((0,1,0)))
 if u.length<.01:u=axis.normalized().cross(Vector((1,0,0)))
 u.normalize();v=axis.normalized().cross(u);verts=[]
 for p,rr in [(a,r),(b,r if r2 is None else r2)]:
  for i in range(sides):verts.append(tuple(p+rr*(math.cos(i*math.tau/sides)*u+math.sin(i*math.tau/sides)*v)))
 faces=[tuple(reversed(range(sides))),tuple(sides+i for i in range(sides))]+[(i,(i+1)%sides,(i+1)%sides+sides,i+sides) for i in range(sides)]
 return mesh(n,verts,faces,m)
def beam(n,a,b,width,m,bevel=.025):
 a,b=Vector(a),Vector(b);ob=cube(n,(a+b)/2,(width,width,(b-a).length),m,bevel);ob.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();return ob
# Main workshop: open front and right work bay, masonry half-wall under awning.
for x,y in [(-1.45,-1.25),(1.45,-1.25),(-1.45,1.25),(1.45,1.25),(2.55,-1.05),(2.55,1.15)]:
 for j in range(3):cube('Stacked dressed stone footing',(x,y, .19+j*.32),(.76-j*.035,.76-j*.035,.31),STONE[j%3],.075)
cur=cols['02 Timber workshop']
for i in range(12):cube('Wide workshop floorboard',(.50,-1.30+i*.235,.29),(4.30,.22,.17),WOOD[i%4],.012)
for x,y in [(-1.45,-1.25),(1.45,-1.25),(-1.45,1.25),(1.45,1.25)]:
 cube('Massive hewn oak post',(x,y,1.73),(.47,.47,2.04),WOOD[2],.045)
 for z in [2.43,2.63]:cube('Forged structural collar',(x,y,z),(.53,.53,.14),IRON,.022)
 cube('Pale exposed end grain',(x,y,2.76),(.45,.45,.045),END,.016)
for x,y in [(2.55,-1.05),(2.55,1.15)]:
 cube('Awning post',(x,y,1.50),(.34,.34,1.63),WOOD[2],.04);cube('Awning iron collar',(x,y,2.23),(.42,.42,.17),IRON,.02);cube('Awning cut end',(x,y,2.34),(.32,.32,.05),END,.012)
for y in [-1.25,1.25]:
 beam('Heavy gable tie',(-1.6,y,2.42),(1.6,y,2.42),.25,WOOD[1])
 beam('Gable left rafter',(-1.7,y,2.5),(0,y,4.02),.28,WOOD[2]);beam('Gable right rafter',(0,y,4.02),(1.7,y,2.5),.28,WOOD[2])
 cube('Projecting ridge finial',(0,y,4.02),(.32,.36,.63),WOOD[2],.04);cube('Finial end grain',(0,y,4.35),(.30,.34,.035),END,.012);cube('Finial collar',(0,y,3.88),(.39,.43,.20),IRON,.025)
beam('Roof ridge timber',(0,-1.65,3.98),(0,1.65,3.98),.25,WOOD[2])
for x in [-1.45,1.45]:beam('Long eave timber',(x,-1.55,2.49),(x,1.55,2.49),.27,WOOD[1])
# Closed rear and left wall, with large bays visible from orbit.
for i in range(9):cube('Rear wall plank',(-1.23+i*.31,1.25,1.50),(.30,.15,1.87),WOOD[i%4],0)
for i in range(7):cube('Left wall plank',(-1.45,-.70+i*.30,1.44),(.15,.28,1.74),WOOD[(i+1)%4],0)
for x in [-1.45,1.45]:
 for y in [-1.25,1.25]:beam('Diagonal frame brace',(x,y,2.0),(x*.60,y,2.43),.16,WOOD[1],.01)
cur=cols['01 Stone foundations']
for j in range(2):
 for i in range(4):cube('Awning stone half wall',(2.55,-.65+i*.51,.39+j*.39),(.36,.49,.37),STONE[(j+i)%3],.055)
# Curved gable roof, three overlapping rows of broad red shingles.
cur=cols['04 Red shingle roof']
def profile(t):return 4.03-1.53*(t**1.40)
for side in [-1,1]:
 for row in range(3):
  ta=row/3;tb=min(1,(row+1)/3+.065)
  for j in range(7):
   y0=-1.55+j*3.1/7;y1=y0+3.1/7-.018;v=[]
   for k in range(3):
    t=ta+(tb-ta)*k/2
    for y in [y0,y1]:v.append((side*1.75*t,y,profile(t)+.06*(2-row)+(.02*random.random() if k==2 else 0)))
   v += [(x,y,z-.085) for x,y,z in v]
   faces=[(0,1,3,2),(2,3,5,4),(8,9,7,6),(10,11,9,8),(0,6,7,1),(4,5,11,10),(0,2,8,6),(2,4,10,8),(1,7,9,3),(3,9,11,5)]
   ob=mesh('Curved roof shingle %d %d %d'%(side,row,j),v,faces,RED[(row+j)%4])
   bm=bmesh.new();bm.from_mesh(ob.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(ob.data);bm.free()
# Heavy curved roof perimeter rafters and a middle iron reinforcement strap.
for side in [-1,1]:
 for y in [-1.60,1.60]:
  for k in range(3):
   t=k/3;s=(k+1)/3;beam('Curved perimeter rafter',(side*1.77*t,y,profile(t)),(side*1.77*s,y,profile(s)),.20,WOOD[2],.018)
 for k in range(4):
  t=k/4;s=(k+1)/4;beam('Roof iron reinforcement',(side*1.77*t,-.1,profile(t)+.17),(side*1.77*s,-.1,profile(s)+.17),.12,IRON,.008)
  rod('Roof strap rivet',(side*1.77*s,-.1,profile(s)+.21),(side*1.77*s,-.1,profile(s)+.27),.052,GOLD,sides=6)
# Small sloping side awning, a separate mass below main roof.
for j in range(6):
 y=-1.26+j*.45
 beam('Awning red board',(1.20,y,2.78),(2.77,y,2.29),.43,RED[j%4],.024)
for y in [-1.25,1.43]:beam('Awning edge beam',(1.20,y,2.65),(2.78,y,2.18),.19,WOOD[2])
# Quarry rocks: deliberately few broad facets and chipped edges.
cur=cols['03 Rock stockpile']
def rock(n,p,s,seed):
 rng=random.Random(seed);bm=bmesh.new();bmesh.ops.create_cube(bm,size=2);bmesh.ops.bevel(bm,geom=list(bm.edges),offset=.32,segments=1,affect="EDGES")
 for ve in bm.verts:
  ve.co.x*=s[0]*rng.uniform(.93,1.07);ve.co.y*=s[1]*rng.uniform(.93,1.07);ve.co.z*=s[2]*rng.uniform(.93,1.07)
  ve.co.z=max(ve.co.z,-s[2]*.65)
 me=bpy.data.meshes.new(n);bm.to_mesh(me);bm.free();ob=bpy.data.objects.new(n,me);cur.objects.link(ob);ob.location=p
 for m in STONE:me.materials.append(m)
 for f in me.polygons:f.material_index=1
 return ob
rocks=[(-2.10,-1.50,.7,.67,.65,.9),(-2.30,-2.12,.43,.6,.52,.55),(-1.75,-2.35,.40,.51,.51,.5),(-1.3,-2.52,.36,.5,.43,.43),(-2.25,-1.75,1.08,.40,.4,.5),(-1.5,-1.72,.44,.47,.40,.5)]
for i,(x,y,z,sx,sy,sz) in enumerate(rocks):rock('Rough quarry boulder %02d'%i,(x,y,z),(sx,sy,sz),28+i)
for i,p in enumerate([(-.85,-2.26,.38),(-1.46,-2.03,.50)]):cube('Partly squared quarry block',p,(.74,.67,.73),STONE[i%3],.10)
for i in range(7):
 a=i*2.4;rock('Large stone chip',(-1.7+1.05*math.cos(a),-2.0+.60*math.sin(a),.10),(.14,.11,.14),100+i)
# Cutting bench, mallet/chisel and finished block shelves.
cur=cols['05 Bench tools and lanterns']
for x in [-.20,.75]:
 for y in [-1.12,-.40]:cube('Cutting bench leg',(x,y,.64),(.19,.19,.75),WOOD[2],.025)
cube('Thick stone cutting slab',(.275,-.76,1.07),(1.36,.94,.35),STONE[2],.095)
rod('Mason chisel',(-.25,-.90,1.28),(.24,-1.0,1.28),.035,STEEL,sides=6)
rod('Mallet handle',(.51,-.81,1.3),(.88,-.51,1.3),.045,WOOD[1],sides=6);ob=cube('Mallet head',(.56,-.77,1.35),(.32,.20,.19),WOOD[0],.045);ob.rotation_euler.z=.6
for x in [-.84,.84]:beam('Rear shelf upright',(x,.9,.30),(x,.9,2.25),.12,WOOD[0],.008)
for z in [.80,1.46]:
 cube('Stone storage shelf',(0,.85,z),(2.0,.44,.12),WOOD[1],.014)
 for i in range(3):cube('Finished cut stone',(-.62+i*.62,.85,z+.22),(.48,.35,.30),STONE[i%3],.035)
for j in range(3):cube('Stacked stone beside bench',(1.96,.78,.45+j*.32),(.48,.53,.30),STONE[j%3],.04)
for x,y,z in [(-1.48,-1.65,1.97),(2.73,-1.33,1.75)]:
 beam('Lantern bracket',(x,y+.40,z+.48),(x,y,z+.48),.10,IRON,.012);rod('Lantern suspension',(x,y,z+.48),(x,y,z+.26),.025,IRON,sides=6)
 cube('Amber lantern glass',(x,y,z),(.27,.26,.40),GLOW,.018)
 for zz in [z-.24,z+.24]:cube('Lantern metal cap',(x,y,zz),(.37,.34,.10),IRON,.025)
 for dx in [-.15,.15]:beam('Lantern frame',(x+dx,y-.145,z-.21),(x+dx,y-.145,z+.21),.035,IRON,0)
 beam('Lantern cross brace',(x-.15,y-.15,z-.21),(x+.15,y-.15,z+.21),.033,IRON,0)
 light=bpy.data.lights.new('Warm lantern spill','POINT');light.energy=12;light.color=(1,.32,.04);light.shadow_soft_size=.30;ob=bpy.data.objects.new('Warm lantern spill',light);cur.objects.link(ob);ob.location=(x,y-.18,z)
# Small plain ownership pennant added above the front work bay.
cur=cols['06 Player flag']
beam('Ownership flag pole',(1.5,-1.3,2.7),(1.5,-1.3,3.50),.08,WOOD[2],.008)
v=[];f=[]
for j in range(4):
 for i in range(6):
  u=i/5;t=j/3;v.append((1.52+.57*u-.14*(i==5)*(1-abs(t-.5)*2),-1.3+.05*math.sin(u*5+t),3.44-.42*t-.055*u))
for j in range(3):
 for i in range(5):p=j*6+i;f.append((p,p+1,p+7,p+6))
ob=mesh('Ownership flag cloth',v,f,TEAM)
for p in ob.data.polygons:p.use_smooth=True
create_stage(C,cols['07 Studio']);scene['source_note']='Stonemason reference reconstruction. Rear construction inferred. Ownership flag added for player identification.'
im=bpy.data.images.load(str(A/'reference.png'));im.pack();im.use_fake_user=True
bpy.context.view_layer.update();stats={'objects':len(scene.objects),'meshes':sum(o.type=='MESH' for o in scene.objects),'faces':sum(len(o.data.polygons) for o in scene.objects if o.type=='MESH'),'materials':len(bpy.data.materials),'blender':bpy.app.version_string};(A/'model-stats.json').write_text(json.dumps(stats,indent=2));bpy.ops.wm.save_as_mainfile(filepath=str(A/C['blend']))
