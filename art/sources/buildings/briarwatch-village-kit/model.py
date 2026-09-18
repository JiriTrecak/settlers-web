"""Briarwatch bark cottage, twig cage, merchant cart and breakable supply crate.
Original geometry from the approved generated cast-and-village reference sheet.
"""
import bpy,bmesh,math,json,random,sys,struct
from pathlib import Path
from mathutils import Vector
A=Path(__file__).resolve().parent;ROOT=A.parents[3]
sys.path.insert(0,str(ROOT/'experiments/building-studio'))
from stage import create_stage,aim
if not bpy.app.background:raise RuntimeError('Build in background Blender')
bpy.ops.wm.read_factory_settings(use_empty=True)
C=json.loads((A/'asset.json').read_text());rng=random.Random(91826)
origins={'bark-cottage':(-5,0,0),'twig-cage':(1,0,0),'merchant-cart':(6,0,0),'supply-crate':(1,-5,0),'watch-bivouac':(-5,-6,0),'ruined-cottage':(6,-6,0)}
cols={}
for name in [*origins,'Studio']:
 c=bpy.data.collections.new(name);bpy.context.scene.collection.children.link(c);cols[name]=c
current=None;offset=Vector((0,0,0))
def material(name,color,rough=.85,emit=0):
 rgb=[int(color[i:i+2],16)/255 for i in (0,2,4)];linear=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in rgb]
 m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*linear,1);p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*linear,1);p.inputs['Roughness'].default_value=rough
 if emit:p.inputs['Emission Color'].default_value=(*linear,1);p.inputs['Emission Strength'].default_value=emit
 return m
bark=[material('Bark shadow','49301f'),material('Bark warm','704b30'),material('Bark ridges','93683f')]
wood=material('Honey heartwood','b28952');cut=material('Pale cut ends','c8a874');dark=material('Recessed openings','201b14');shell=material('Seed shell plaster','b8a27b')
rope=material('Woven root fibre','967e50');resin=material('Amber resin joints','b96e21',.35);glow=material('Warm lantern resin','f2b34d',.3,.45)
leaves=[material('Leaf shade','344622'),material('Leaf green','5d7033'),material('Leaf veins','8c944b')]
team=material('TC_TeamColor','a83f2e');iron=material('Weathered latch','575247',.62)
def mesh(name,vs,fs,mats,indices=None):
 me=bpy.data.meshes.new(name);me.from_pydata(vs,[],fs);me.update();bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free()
 ob=bpy.data.objects.new(name,me);current.objects.link(ob);ob.location=offset
 for m in mats:me.materials.append(m)
 if indices:
  for face in me.polygons:face.material_index=indices[face.index%len(indices)]
 return ob
def box(name,p,size,m,bevel=0):
 x,y,z=p;w,d,h=size;vs=[(x+sx*w/2,y+sy*d/2,z+sz*h/2) for sz in [-1,1] for sy in [-1,1] for sx in [-1,1]]
 ob=mesh(name,vs,[(0,2,3,1),(4,5,7,6),(0,1,5,4),(2,6,7,3),(0,4,6,2),(1,3,7,5)],[m])
 if bevel:mod=ob.modifiers.new('Chipped edges','BEVEL');mod.width=bevel;mod.segments=1
 return ob
def rod(name,a,b,r,m,sides=7,r2=None):
 a,b=Vector(a),Vector(b);axis=(b-a).normalized();u=axis.cross(Vector((0,0,1)))
 if u.length<.1:u=axis.cross(Vector((0,1,0)))
 u.normalize();v=axis.cross(u);vs=[tuple(p+(u*math.cos(i*math.tau/sides)+v*math.sin(i*math.tau/sides))*radius) for p,radius in [(a,r),(b,r if r2 is None else r2)] for i in range(sides)]
 fs=[tuple(reversed(range(sides))),tuple(range(sides,2*sides))]+[(i,(i+1)%sides,(i+1)%sides+sides,i+sides) for i in range(sides)]
 return mesh(name,vs,fs,[m])
def ellipsoid(name,p,s,m,seg=10,rings=5):
 vs=[]
 for j in range(rings+1):
  phi=math.pi*j/rings
  for i in range(seg):
   a=math.tau*i/seg;vs.append((p[0]+s[0]*math.sin(phi)*math.cos(a),p[1]+s[1]*math.sin(phi)*math.sin(a),p[2]+s[2]*math.cos(phi)))
 fs=[(j*seg+i,j*seg+(i+1)%seg,(j+1)*seg+(i+1)%seg,(j+1)*seg+i) for j in range(rings) for i in range(seg)]
 return mesh(name,vs,fs,[m])
def leaf(name,a,b,width,m=None):
 a,b=Vector(a),Vector(b);direction=b-a;across=direction.cross(Vector((0,0,1)))
 if across.length<.1:across=Vector((1,0,0))
 across.normalize();vs=[]
 for t in [0,.25,.55,.8,1]:
  center=a+direction*t+Vector((0,0,.1*math.sin(t*math.pi)))
  w=width*math.sin(t*math.pi);vs.extend([tuple(center-across*w),tuple(center+Vector((0,0,.075))),tuple(center+across*w)])
 fs=[]
 for i in range(4):
  j=i*3;fs.extend([(j,j+3,j+4,j+1),(j+1,j+4,j+5,j+2)])
 o=mesh(name,vs,fs,[m] if m else leaves,[i%2 for i in range(8)] if not m else None)
 mod=o.modifiers.new('Leaf thickness','SOLIDIFY');mod.thickness=.022
 rod(name+' midrib',a,b,.018,leaves[2])
 return o
def lantern(x,y,z):
 ellipsoid('Amber lantern',(x,y,z),(.17,.17,.26),glow)
 for h in [-.22,.23]:rod('Lantern collar',(x,y,z+h),(x,y,z+h+.06),.19,bark[0])
 rod('Hanging fibre',(x,y,z+.26),(x,y,z+.55),.025,rope)
def select(name):
 global current,offset
 current=cols[name];offset=Vector(origins[name])
select('bark-cottage')
# Flattened seed-shell walls with a strong arched entrance and separate overlapping bark tiles.
ellipsoid('Seed shell walls',(0,0,1.6),(2.05,1.65,1.7),shell,16,8)
for i in range(12):
 a=i*math.tau/12;rod('Living timber rib',(math.cos(a)*1.85,math.sin(a)*1.5,.2),(math.cos(a)*1.8,math.sin(a)*1.45,2.65),.105,bark[1])
for j in range(4):
 t=j/4;radius=2.35*(1-t*.79);z=2.45+j*.49;n=max(8,18-j*3)
 for i in range(n):
  a=math.tau*(i+(j%2)*.5)/n;da=math.pi/n*.92;ri=max(.18,radius-.82);zo=z+.65
  vs=[]
  for aa in [a-da,a,a+da]:vs.append((radius*math.cos(aa),radius*.83*math.sin(aa),z+(.07 if aa==a else 0)))
  for aa in [a-da,a,a+da]:vs.append((ri*math.cos(aa),ri*.83*math.sin(aa),zo+(.07 if aa==a else 0)))
  ob=mesh('Overlapping bark roof tile',vs,[(0,1,4,3),(1,2,5,4)],bark,[1+(i+j)%2,1]);mod=ob.modifiers.new('Bark tile thickness','SOLIDIFY');mod.thickness=.07
  rod('Raised roof grain',vs[1],vs[4],.025,bark[2],5)
rod('Roof ridge',(0,0,3.8),(0,0,4.8),.15,bark[1]);leaf('Roof pennant',(0,0,4.62),(.85,.12,4.38),.23,team)
# Door faces -Y, with raised lintel segments and an inset dark arch.
vs=[(-.65,-1.66,.2),(.65,-1.66,.2),(.65,-1.66,1.64),(.42,-1.66,2.02),(0,-1.66,2.22),(-.42,-1.66,2.02),(-.65,-1.66,1.64)]
mesh('Dark arched doorway',vs,[tuple(range(7))],[dark])
for i in range(5):
 x=-.51+i*.255;h=1.6+.38*(1-abs(x)/.65);box('Door plank',(x,-1.70,.2+h/2),(.235,.095,h),bark[1],.02)
for a,b in zip(vs[2:],vs[3:]+[vs[0]]):rod('Curved bark door frame',a,b,.10,bark[2])
rod('Door frame right',vs[1],vs[2],.1,bark[2]);box('Door latch',(.32,-1.8,1.05),(.28,.07,.10),wood)
for j in range(3):box('Entrance step',(0,-1.87-j*.30,.3-j*.08),(1.65,.34,.18),wood,.03)
for side in [-1,1]:
 # Leaf side awnings supported by twig stakes.
 rod('Awning post',(side*2.32,-.3,0),(side*2.32,-.3,2.2),.10,bark[1]);rod('Awning tie',(side*1.55,-.3,2.7),(side*2.35,-.3,2.15),.07,wood)
 leaf('Curled side awning',(side*1.3,.25,2.75),(side*2.6,-.75,2.03),.60)
 lantern(side*2.32,-.3,1.55)
 for j in range(3):ellipsoid('Resin foundation',(side*(1.65+j*.12),.5-j*.35,.2),(.25,.22,.22),resin,7,4)
# Rear window makes the building readable from a full orbit.
box('Back recessed window',(0,1.54,1.75),(.85,.13,.83),dark)
for x in [-.46,.46]:rod('Window frame',(x,1.65,1.3),(x,1.65,2.22),.08,wood)
for z in [1.32,1.78,2.2]:rod('Window lintel',(-.5,1.65,z),(.5,1.65,z),.07,wood)
select('twig-cage')
for x in [-1.05,1.05]:
 for y in [-1.05,1.05]:
  rod('Cage corner',(x,y,.05),(x,y,2.75),.16,bark[1]);ellipsoid('Resin corner binding',(x,y,2.53),(.22,.22,.2),resin,8,4)
for z in [.16,2.5]:
 for side in [-1,1]:
  rod('Cage sill',(-1.16,side*1.05,z),(1.16,side*1.05,z),.12,bark[2]);rod('Cage side sill',(side*1.05,-1.16,z),(side*1.05,1.16,z),.12,bark[2])
for i in range(7):
 p=-.9+i*.3
 for side in [-1,1]:rod('Side twig bars',(side*1.05,p,.2),(side*1.05,p,2.48),.06,bark[i%3])
 rod('Rear twig bars',(p,1.05,.2),(p,1.05,2.48),.06,bark[i%3]);rod('Roof twig bars',(p,-1.05,2.55),(p,1.05,2.55),.08,bark[1])
 # Distinct front hinged gate.
 rod('Gate bars',(p,-1.12,.24),(p,-1.12,2.40),.065,wood)
for z in [.3,2.35]:rod('Gate crossbar',(-.94,-1.15,z),(.95,-1.15,z),.09,bark[2])
for z in [.65,1.95]:ellipsoid('Gate hinge',(-1.06,-1.2,z),(.14,.13,.14),resin,7,4)
box('Readable gate latch',(.68,-1.26,1.30),(.56,.14,.22),iron,.025);rod('Latch pin',(.88,-1.34,1.1),(.88,-1.34,1.48),.045,wood)
for i in range(7):box('Cage floor plank',(-.9+i*.30,0,.10),(.29,2.08,.13),bark[1])
select('merchant-cart')
for i in range(6):box('Cart floor plank',(-.85+i*.34,.25,.75),(.32,2.5,.15),wood,.025)
for side in [-1,1]:
 for y in [-.98,1.48]:rod('Cart upright',(side*1.04,y,.6),(side*1.04,y,1.75),.09,bark[1])
 for z in [1.05,1.4]:box('Cart side board',(side*1.04,.25,z),(.14,2.65,.25),bark[2],.025)
 rod('Long hand shaft',(side*.8,-2.6,.6),(side*.8,.7,.7),.075,wood)
 # Wagon wheels stand vertically in the YZ plane.
 cx=side*1.32;cy=.3;cz=.65;r=.64
 for i in range(12):
  a=i*math.tau/12;b=(i+1)*math.tau/12
  rod('Wooden wheel rim',(cx,cy+math.cos(a)*r,cz+math.sin(a)*r),(cx,cy+math.cos(b)*r,cz+math.sin(b)*r),.09,bark[1])
  if i%2==0:rod('Wheel spoke',(cx,cy,cz),(cx,cy+math.cos(a)*r,cz+math.sin(a)*r),.045,wood)
 rod('Wheel axle hub',(cx-.12,cy,cz),(cx+.12,cy,cz),.17,resin)
 rod('Canopy pole',(side*1.05,1.25,.7),(side*1.05,1.25,2.9),.07,bark[1])
rod('Cart axle',(-1.6,.3,.65),(1.6,.3,.65),.10,wood)
leaf('Merchant leaf canopy',(-1.2,1.3,2.86),(1.25,-.55,2.52),1.1)
for x,y,z,scale in [(-.5,.65,1.2,.65),(.42,.8,1.22,.66),(-.4,-.5,1.14,.42)]:
 ellipsoid('Amber-filled sack',(x,y,z),(.42*scale/.6,.38*scale/.6,.5*scale/.6),resin,9,5);rod('Tied sack neck',(x,y,z+.4),(x,y,z+.62),.12,rope)
for j in range(3):rod('Rolled leaf ledger',(-.6+j*.4,.8,1.88),(-.6+j*.4,1.32,1.88),.16,leaves[j%3],10)
lantern(-1.2,.0,2.1);leaf('Merchant hanging pennant',(1.05,1.3,2.7),(1.12,1.3,1.45),.28,team)
select('supply-crate')
box('Crate dark body',(0,0,.5),(1,1,.95),bark[0])
for i in range(4):
 for side in [-1,1]:box('Crate planks',(side*.51,-.375+i*.25,.5),(.06,.23,.92),bark[1+(i%2)])
 box('Crate lid',(-.375+i*.25,0,1),(.23,1.05,.09),wood)
for side in [-1,1]:
 for z in [.12,.87]:box('Crate brace',(0,side*.54,z),(1.12,.07,.15),wood)
rod('Crossed crate brace',(-.44,-.59,.23),(.44,-.59,.77),.055,bark[2],4)
ellipsoid('Amber supply seal',(0,-.63,.51),(.15,.055,.16),resin,8,4)
select('watch-bivouac')
for y in [-1.4,1.4]:
 for side in [-1,1]:rod('Forked tent support',(side*1.7,y,.02),(side*.04,y,2.05),.10,bark[1])
rod('Tent ridge',(0,-1.65,2.10),(0,1.65,2.10),.10,wood)
for side in [-1,1]:
 vs=[(0,-1.4,2.08),(0,1.4,2.08),(side*1.72,1.5,.18),(side*1.80,-1.55,.18)]
 mesh('Overlapping leaf tent roof',vs,[(0,1,2,3)],leaves,[1]);rod('Tent leaf vein',vs[0],vs[2],.025,leaves[2]);rod('Tent leaf vein',vs[1],vs[3],.025,leaves[2])
 for y in [-1.7,1.7]:rod('Tent anchor',(side*2,y,0),(side*2,y,.28),.08,wood);rod('Tent tether',(0,y*.8,1.94),(side*2,y,.2),.025,rope)
box('Bed of split bark',(0,.6,.11),(1.8,1.3,.17),bark[1],.05)
leaf('Red watch pennant',(0,-1.55,2.25),(.65,-1.55,2.12),.22,team)
lantern(-1.8,-1.5,1.02)
select('ruined-cottage')
char=material('Charred cottage timber','30281f')
for side in [-1,1]:
 for y in [-1.2,1.2]:rod('Broken cottage post',(side*1.4,y,.03),(side*1.4,y,1.1+(y+1.2)*.20),.14,char)
for i in range(14):
 a=rng.uniform(0,math.tau);x=rng.uniform(-1.5,1.5);y=rng.uniform(-1.2,1.2)
 rod('Collapsed roof splinter',(x,y,.12),(x+math.cos(a)*rng.uniform(.5,1.1),y+math.sin(a)*.8,rng.uniform(.18,.65)),.08,bark[i%3],5,.03)
for i in range(7):ellipsoid('Broken seed-shell wall',(rng.uniform(-1.6,1.6),rng.uniform(-1.3,1.3),.16),(.38,.30,.18),shell,7,3)
box('Shattered doorway sill',(0,-1.5,.1),(2,.2,.2),char)
create_stage(C,cols['Studio'])
for o in cols['Studio'].objects:
 if o.type=='LIGHT':o.location*=1.7;o.data.size*=1.7;o.data.energy*=2;aim(o,(0,0,1.5))
im=bpy.data.images.load(str(A/'reference.png'));im.pack();im.use_fake_user=True
bpy.context.scene['source_note']='Original Briarwatch reference-based village kit. Rear surfaces inferred. Editable named geometry; runtime modules merged by material. Red TC_TeamColor flags only.'
bpy.ops.wm.save_as_mainfile(filepath=str(A/C['blend']))
report=[]
for name,origin in origins.items():
 bpy.ops.object.select_all(action='DESELECT');deps=bpy.context.evaluated_depsgraph_get();copies=[]
 for ob in cols[name].objects:
  evaluated=ob.evaluated_get(deps);data=bpy.data.meshes.new_from_object(evaluated);copy=bpy.data.objects.new(ob.name+' runtime',data);bpy.context.scene.collection.objects.link(copy);copy.matrix_world=ob.matrix_world;copy.location-=Vector(origin);copy.select_set(True);copies.append(copy)
 bpy.context.view_layer.objects.active=copies[0];bpy.ops.object.join();merged=bpy.context.object;merged.name=name
 out=A/(name+'.glb');bpy.ops.export_scene.gltf(filepath=str(out),use_selection=True,export_format='GLB',export_animations=False,export_yup=True,export_cameras=False,export_lights=False)
 data=out.read_bytes();length=struct.unpack_from('<I',data,12)[0];doc=json.loads(data[20:20+length]);triangles=sum(doc['accessors'][p['indices']]['count']//3 for m in doc['meshes'] for p in m['primitives'])
 report.append({'id':name,'triangles':triangles,'meshes':len(doc['meshes']),'materials':len(doc.get('materials',[])),'bytes':len(data)})
 bpy.data.objects.remove(merged,do_unlink=True)
(A/'exports.json').write_text(json.dumps(report,indent=2))
